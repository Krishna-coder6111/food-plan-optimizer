import './globals.css';

export const metadata = {
  title: 'Nutrient Engine — Minimum Cost, Maximum Nutrition',
  description: 'LP-optimized meal planning with real regional pricing. 1g/lb protein, hormone-aware, evidence-based.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cream-100 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
