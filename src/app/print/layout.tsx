/**
 * Shared layout for every /print route: invoices print on A5 paper
 * (half of A4), one bill per sheet.
 */
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
@page { size: A5 portrait; margin: 8mm; }
@media print {
  html, body { background: #fff; }
}
`}</style>
      {children}
    </>
  );
}
