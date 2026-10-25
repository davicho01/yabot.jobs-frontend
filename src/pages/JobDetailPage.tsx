import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import { adminApi } from "../api/admin";
import { useConfirm } from "../components/ConfirmDialog";
import { BandStatusBadge, JobCaseFile } from "../components/JobCaseFile";
import { JobBandActions } from "../components/JobBandActions";
import CompanyLogo from "../components/CompanyLogo";
import { BriefcaseIcon } from "../components/PillIcons";
import { scannedPosting } from "../utils/jobPosting";
import "./JobBoardPage.css";
import "./JobBoardCards.css";
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

  const company = scannedPosting(job)?.company_name ?? job.url.domain;

  // The shared job page wears the board's card style: My applications above
  // the card (signed in), the My applications header's plum band with the
  // logo tile, and the card layout of the posting itself.
  return (
    <div className="board board--cards board--standalone">
      {dialog}
      <div className="board__detail board__detail--standalone">
        {/* No way back to a list: someone who followed a shared link came
            from somewhere else, and the header's search is right above. */}
        {user && (
          <div className="board__detail-top">
            <Link to="/applications" className="board__detail-applications">
              <BriefcaseIcon />
              My applications
            </Link>
          </div>
        )}
        <div className="board__detail-inner">
          <div className="board__detail-band board__detail-band--plum">
            <span className="board__detail-tile">
              <CompanyLogo name={company} logoUrl={scannedPosting(job)?.company_logo_url} size={40} />
            </span>
            <BandStatusBadge job={job} />
            <JobBandActions job={job} company={company} />
          </div>
          <JobCaseFile
            job={job}
            user={user}
            isRescanning={rescanMutation.isPending}
            rescanFailed={rescanMutation.isError}
            onRescan={() => rescanMutation.mutate(job.url.id)}
            onDelete={() => deleteListing(job.url.id)}
            isDeleting={deleteListingMutation.isPending}
            boardCards
            showDates
          />
        </div>
      </div>
    </div>
  );
}
