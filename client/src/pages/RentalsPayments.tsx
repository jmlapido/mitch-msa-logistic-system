import { PaymentsTab } from '@/components/rentals/tabs/PaymentsTab';
import { ArchiveBanner } from '@/components/rentals/ArchiveBanner';

export default function RentalsPayments() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Payments</h1>
      <ArchiveBanner />
      <PaymentsTab />
    </div>
  );
}
