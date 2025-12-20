// "use client";

// import { motion } from "framer-motion";

// type SeatRequest = {
//   id: string;
//   userId: string;
//   seatIndex?: number | null;
// };

// type Props = {
//   open: boolean;
//   requests: SeatRequest[];
//   onApprove: (requestId: string) => void;
//   onDeny: (requestId: string) => void;
//   onClose: () => void;
// };

// export default function SeatApprovalModal({
//   open,
//   requests,
//   onApprove,
//   onDeny,
//   onClose,
// }: Props) {
//   if (!open) return null;

//   return (
//     <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
//       <motion.div
//         initial={{ scale: 0.9, opacity: 0 }}
//         animate={{ scale: 1, opacity: 1 }}
//         className="bg-slate-900 border border-slate-800 p-4 rounded-xl w-full max-w-md shadow-xl"
//       >
//         <div className="flex justify-between items-center mb-3">
//           <h2 className="text-sm font-semibold">Seat Requests</h2>
//           <button onClick={onClose} className="text-slate-400 hover:text-white">
//             ✕
//           </button>
//         </div>

//         {requests.length === 0 ? (
//           <p className="text-xs text-slate-400">No pending requests.</p>
//         ) : (
//           <div className="space-y-2 max-h-64 overflow-y-auto">
//             {requests.map((r) => (
//               <div
//                 key={r.id}
//                 className="bg-slate-800/60 border border-slate-700 rounded-lg p-2 flex items-center justify-between"
//               >
//                 <div>
//                   <div className="text-xs font-medium">
//                   {r.userId ? r.userId.slice(0, 6) : "Unknown"}

//                   </div>
//                   <div className="text-[11px] text-slate-400">
//                     Requested seat:{" "}
//                     {r.seatIndex !== null && r.seatIndex !== undefined
//                       ? r.seatIndex + 1
//                       : "Any seat"}
//                   </div>
//                 </div>

//                 <div className="flex gap-1">
//                   <button
//                     onClick={() => onApprove(r.id)}
//                     className="btn btn-primary text-xs px-2 py-1"
//                   >
//                     Approve
//                   </button>
//                   <button
//                     onClick={() => onDeny(r.id)}
//                     className="btn btn-danger text-xs px-2 py-1"
//                   >
//                     Deny
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </motion.div>
//     </div>
//   );
// }





"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, X, User } from "lucide-react"; // Recommended icon library

type SeatRequest = {
  id: string;
  userId: string;
  seatIndex?: number | null;
  user?: {
    nickName?: string;
    profilePicture?: string | null;
    email?: string;
  };
};

type Props = {
  open: boolean;
  requests: SeatRequest[];
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
  onClose: () => void;
};

export default function SeatApprovalModal({
  open,
  requests,
  onApprove,
  onDeny,
  onClose,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative bg-slate-900/90 border border-white/10 backdrop-blur-md p-6 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            {/* Header Accent */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />

            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Seat Requests
                </h2>
                <p className="text-xs text-slate-400">
                  {requests.length} pending applications
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {requests.length === 0 ? (
                <div className="py-10 text-center">
                  <User className="mx-auto text-slate-600 mb-2" size={32} />
                  <p className="text-sm text-slate-500">All caught up!</p>
                </div>
              ) : (
                requests.map((r) => (
                  <motion.div
                    layout
                    key={r.id}
                    className="group bg-white/5 border border-white/5 rounded-xl p-3 flex items-center justify-between hover:border-white/10 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border border-white/10 overflow-hidden">
                        {r.user?.profilePicture ? (
                          <img src={r.user.profilePicture} alt="User" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-slate-300">
                            {r.user?.nickName?.charAt(0) || "U"}
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          {r.user?.nickName || `User-${r.userId.slice(0, 4)}`}
                        </div>
                        <div className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 inline-block">
                          Requested seat: {r.seatIndex !== null && r.seatIndex !== undefined ? r.seatIndex + 1 : "Any"}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => onDeny(r.id)}
                        className="p-2 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                        title="Deny"
                      >
                        <X size={16} />
                      </button>
                      <button
                        onClick={() => onApprove(r.id)}
                        className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all"
                        title="Approve"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}