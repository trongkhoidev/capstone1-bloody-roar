// apps/web/src/graphql/modules/application/application.module.ts
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { ApplicationStatus, IssueStatus } from "@bloody-roar/database";
import type { Prisma } from "@bloody-roar/database";
import { UserRef } from "../user/user.module";
import { IssueRef } from "../issue/issue.module";
import { z } from "zod";

const ApplicationStatusEnum = builder.enumType(ApplicationStatus, {
  name: "ApplicationStatus",
});

const APPLICATION_INCLUDE = {
  developer: true,
  issue: {
    include: {
      token: true,
      client: true,
      developer: true,
      _count: { select: { applications: true } },
    }
  },
} satisfies Prisma.ApplicationInclude;

export const ApplicationRef = builder.prismaObject("Application", {
  description: "A Developer's application to an Issue",
  include: APPLICATION_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    status: t.expose("status", { type: ApplicationStatusEnum }),
    message: t.exposeString("message", { nullable: true }),
    createdAt: t.string({
      description: "ISO 8601",
      resolve: (app) => app.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      description: "ISO 8601",
      resolve: (app) => app.updatedAt.toISOString(),
    }),
    developer: t.field({
      type: UserRef,
      description: "Applicant",
      resolve: (app) => app.developer,
    }),
    issue: t.field({
      type: IssueRef,
      description: "The bounty task",
      resolve: (app) => app.issue,
    }),
  }),
});

// Zod
const CreateApplicationSchema = z.object({
  issueId: z.string().cuid(),
  message: z.string().max(2000).optional(),
});

// Queries
builder.queryField("applications", (t) =>
  t.field({
    type: [ApplicationRef],
    description: "Get all applications for a specific issue (Client only)",
    args: {
      issueId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      
      const issue = await ctx.db.issue.findUnique({
        where: { id: String(args.issueId) },
      });
      if (!issue) throw gqlError("Issue not found", "NOT_FOUND");
      
      // Only the client of the issue can see all applications
      if (issue.clientId !== user.id && user.role !== "ADMIN") {
        throw gqlError("FORBIDDEN: Only the client can view applications", "FORBIDDEN");
      }

      return ctx.db.application.findMany({
        where: { issueId: issue.id },
        include: APPLICATION_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
    },
  })
);

builder.queryField("myApplications", (t) =>
  t.field({
    type: [ApplicationRef],
    description: "Get all applications submitted by the current developer",
    resolve: async (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      
      return ctx.db.application.findMany({
        where: { developerId: user.id },
        include: APPLICATION_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
    },
  })
);

// Mutations
builder.mutationField("createApplication", (t) =>
  t.fieldWithInput({
    type: ApplicationRef,
    description: "Apply for an open bounty (Developer only)",
    input: {
      issueId: t.input.id({ required: true }),
      message: t.input.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);

      if (user.role !== "DEVELOPER" && user.role !== "ADMIN") {
        throw gqlError("Only developers can apply for tasks", "FORBIDDEN");
      }

      const input = parseOrThrow(CreateApplicationSchema, args.input);

      const issue = await ctx.db.issue.findUnique({
        where: { id: input.issueId },
      });
      
      if (!issue) throw gqlError("Issue not found", "NOT_FOUND");
      if (issue.status !== IssueStatus.OPEN) {
        throw gqlError("Can only apply to OPEN issues", "BAD_REQUEST");
      }
      
      // Prevent applying multiple times
      const existingApp = await ctx.db.application.findUnique({
        where: {
          issueId_developerId: {
            issueId: issue.id,
            developerId: user.id,
          }
        }
      });
      
      if (existingApp) {
        throw gqlError("You have already applied for this task", "BAD_REQUEST");
      }

      return ctx.db.application.create({
        data: {
          issueId: issue.id,
          developerId: user.id,
          message: input.message ?? null,
          status: ApplicationStatus.PENDING,
        },
        include: APPLICATION_INCLUDE,
      });
    },
  })
);

builder.mutationField("acceptApplication", (t) =>
  t.field({
    type: ApplicationRef,
    description: "Accept an application and assign the developer to the task (Client only)",
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      
      const application = await ctx.db.application.findUnique({
        where: { id: String(args.applicationId) },
        include: APPLICATION_INCLUDE,
      });

      if (!application) throw gqlError("Application not found", "NOT_FOUND");
      
      if (application.issue.clientId !== user.id && user.role !== "ADMIN") {
        throw gqlError("You do not own this issue", "FORBIDDEN");
      }
      
      if (application.issue.status !== IssueStatus.OPEN) {
        throw gqlError("Issue is no longer OPEN", "BAD_REQUEST");
      }
      
      if (application.status !== ApplicationStatus.PENDING) {
        throw gqlError("Can only accept PENDING applications", "BAD_REQUEST");
      }
      
      const [_, updatedApp] = await ctx.db.$transaction([
        ctx.db.issue.update({
          where: { id: application.issue.id },
          data: { 
            status: IssueStatus.IN_PROGRESS,
            developerId: application.developerId
          },
        }),
        ctx.db.application.update({
          where: { id: application.id },
          data: { status: ApplicationStatus.ACCEPTED },
          include: APPLICATION_INCLUDE,
        }),
        ctx.db.application.updateMany({
          where: { 
            issueId: application.issue.id,
            id: { not: application.id },
            status: ApplicationStatus.PENDING
          },
          data: { status: ApplicationStatus.REJECTED },
        })
      ]);

      return updatedApp;
    },
  })
);

builder.mutationField("rejectApplication", (t) =>
  t.field({
    type: ApplicationRef,
    description: "Reject a specific application (Client only)",
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      
      const application = await ctx.db.application.findUnique({
        where: { id: String(args.applicationId) },
        include: APPLICATION_INCLUDE,
      });

      if (!application) throw gqlError("Application not found", "NOT_FOUND");
      
      if (application.issue.clientId !== user.id && user.role !== "ADMIN") {
        throw gqlError("You do not own this issue", "FORBIDDEN");
      }
      
      if (application.status !== ApplicationStatus.PENDING) {
        throw gqlError("Can only reject PENDING applications", "BAD_REQUEST");
      }

      return ctx.db.application.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.REJECTED },
        include: APPLICATION_INCLUDE,
      });
    },
  })
);
