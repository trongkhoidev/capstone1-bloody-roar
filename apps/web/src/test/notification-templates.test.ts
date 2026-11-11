import { describe, expect, it } from "vitest";
import { NotificationType } from "@bloody-roar/database";
import { notificationTemplate } from "../lib/notifications/templates";

describe("notification templates", () => {
  it.each(Object.values(NotificationType))("has a Vietnamese template with a task link for %s", (type) => {
    const text = notificationTemplate(type, { id: "issue-1", title: "Build a parser" });

    expect(text.title).not.toBe("");
    expect(text.body).toContain("Build a parser");
    expect(text.link).toBe("/issues/issue-1");
  });
});
