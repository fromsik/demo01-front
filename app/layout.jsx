import "../styles.css";

export const metadata = {
  title: "TimeBox Planner",
  description: "하루 핵심 목표와 시간 블록 기반 계획 작성 도구",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
