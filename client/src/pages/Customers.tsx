import { CustomerDirectory } from '@/components/customers/CustomerDirectory';

export default function Customers() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Customers</h1>
      {/* Task 4 adds the ?id= switch: id ? <CustomerDetail id={id} /> : <CustomerDirectory /> */}
      <CustomerDirectory />
    </div>
  );
}
