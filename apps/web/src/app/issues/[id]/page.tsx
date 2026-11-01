import { IssueDetailView } from "@/components/marketplace/issue-detail-view";

export default function IssuePage({ params }: { params: { id: string } }) {
  return <IssueDetailView issueId={params.id} />;
}
