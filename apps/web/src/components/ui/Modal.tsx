export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#34343c] bg-[#161619] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-[#8c8c95]">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
