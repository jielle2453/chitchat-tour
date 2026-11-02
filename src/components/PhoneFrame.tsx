// A phone-sized frame: full screen on phones, a centred 430x900 device frame on desktop.
export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:flex md:items-center md:justify-center md:p-6">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-bg md:h-[min(900px,calc(100dvh-48px))] md:max-w-[430px] md:rounded-[36px] md:border md:border-line md:shadow-[0_20px_60px_rgba(17,17,17,0.10)]">
        {children}
      </div>
    </div>
  );
}

// A fixed-size frame for side-by-side demos.
export function MiniPhone({ children, label }: { children: React.ReactNode; label?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {label}
      <div className="relative flex h-[780px] w-[390px] max-w-full flex-col overflow-hidden rounded-[36px] border border-line bg-bg shadow-[0_20px_60px_rgba(17,17,17,0.10)]">
        {children}
      </div>
    </div>
  );
}
