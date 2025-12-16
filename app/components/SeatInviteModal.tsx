type Props = {
  invite: { roomId: string; seatIndex: number } | null;
  onAccept: () => void;
  onReject: () => void;
};

export default function SeatInviteModal({
  invite,
  onAccept,
  onReject,
}: Props) {
  if (!invite) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded p-5 w-80 space-y-4">
        <h3 className="text-lg font-semibold text-white">
          Seat Invitation
        </h3>

        <p className="text-sm text-slate-300">
          Host invited you to join
          <span className="font-semibold"> Seat #{invite.seatIndex}</span>
        </p>

        <div className="flex gap-3">
          <button
            onClick={onAccept}
            className="btn btn-primary w-full"
          >
            Accept
          </button>

          <button
            onClick={onReject}
            className="btn btn-secondary w-full"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
