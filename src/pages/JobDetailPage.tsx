import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import { adminApi } from "../api/admin";
import { useConfirm } from "../components/ConfirmDialog";
import { JobCaseFile } from "../components/JobCaseFile";
import "./JobBoardPage.css";
import { BOARD_PATH } from "../routes";

export function JobDetailPage() {
  const { urlId } = useParams<{ urlId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", urlId],
    queryFn: () => jobsApi.get(urlId!),
    enabled: !!urlId,
  });

  const rescanMutation = useMutation({
    mutationFn: (id: string) => jobsApi.rescan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", urlId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const deleteListingMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteListing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      navigate(BOARD_PATH);
    },
  });

  async function deleteListing(id: string) {
    if (await confirm("Permanently delete this listing? This can't be undone.")) {
      deleteListingMutation.mutate(id);
    }
  }

  if (isLoading) {
    return (
      <div className="board">
        <p className="board__empty">Loading posting…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="board">
        <p className="board__empty">Couldn't find that posting.</p>
      </div>
    );
  }

  return (
    <div className="board">
      {dialog}
      <div className="board__detail board__detail--standalone">
        <JobCaseFile
          job={job}
          user={user}
          isRescanning={rescanMutation.isPending}
          rescanFailed={rescanMutation.isError}
          onRescan={() => rescanMutation.mutate(job.url.id)}
          onDelete={() => deleteListing(job.url.id)}
          isDeleting={deleteListingMutation.isPending}
        />
      </div>
    </div>
  );
}
