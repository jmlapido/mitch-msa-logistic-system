import { useSearchParams } from 'react-router-dom';
import { CustomerDirectory } from '@/components/customers/CustomerDirectory';
import { CustomerDetail } from '@/components/customers/CustomerDetail';

export default function Customers() {
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get('id');
  const id = idParam ? Number(idParam) || null : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Customers</h1>
      {id != null ? <CustomerDetail id={id} /> : <CustomerDirectory />}
    </div>
  );
}
