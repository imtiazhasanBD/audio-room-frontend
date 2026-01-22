import { useEffect, useRef } from "react";
import { ICameraVideoTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";

interface Props {
  videoTrack: IRemoteVideoTrack | ICameraVideoTrack | undefined;
  cover?: string | null;
}

const AgoraPlayer = ({ videoTrack, cover }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && videoTrack) {
      videoTrack.play(ref.current);
    }

    return () => {
      // Do not "close" the track here, just stop playing on this div
      if (videoTrack) {
        videoTrack.stop(); 
      }
    };
  }, [videoTrack]);

  return (
    <div className="w-full h-full relative">
      <div ref={ref} className="w-full h-full overflow-hidden rounded-xl" />
      
      {/* Show cover image if video is muted or missing */}
      {(!videoTrack) && cover && (
        <img 
          src={cover} 
          alt="cover" 
          className="absolute inset-0 w-full h-full object-cover z-10" 
        />
      )}
    </div>
  );
};

export default AgoraPlayer;