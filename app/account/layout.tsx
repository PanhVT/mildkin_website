export const metadata = {
  title: "Góc nhỏ của bạn",
  robots: { index: false, follow: false },
};
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="account-page">
      <div className="container section">{children}</div>
    </div>
  );
}
