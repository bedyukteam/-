import AnalyticsView from "@/components/AnalyticsView";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2 text-on-navy">ניתוח נתוני הערוץ</h1>
      <p className="text-muted-on-navy text-sm mb-6">
        שיקוף חי של YouTube Analytics — כל המספרים נשלפים ישירות מהערוץ. לחיצה על סרטון פותחת
        ניתוח מלא שלו.
      </p>
      <AnalyticsView />
    </div>
  );
}
