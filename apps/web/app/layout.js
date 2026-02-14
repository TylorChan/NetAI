import "./globals.css";

export const metadata = {
  title: "NetAI",
  description: "AI-powered networking voice coach",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
