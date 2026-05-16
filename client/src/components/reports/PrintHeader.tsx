import { useSettings } from '@/lib/hooks/useSettings';

type Props = { title: string; subtitle?: string };

export function PrintHeader({ title, subtitle }: Props) {
  const { settings } = useSettings();
  return (
    <div className="print-only hidden mb-6 pb-4 border-b">
      <div className="flex items-center gap-3 mb-2">
        {settings?.logo_url && (
          <img src={settings.logo_url} alt="Logo" className="h-10 w-10 object-contain" />
        )}
        <div>
          <h1 className="text-xl font-bold">{settings?.company_name ?? 'BillTrack'}</h1>
          <p className="text-sm text-gray-500">{title}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
