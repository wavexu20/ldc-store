import { db, products } from "@/lib/db";
import { getAdminVoucherBatches } from "@/lib/actions/vouchers";
import { VoucherManager } from "@/components/admin/voucher-manager";

export const dynamic = "force-dynamic";

export default async function AdminVouchersPage() {
  const [batches, productOptions] = await Promise.all([
    getAdminVoucherBatches(),
    db.query.products.findMany({ columns: { id: true, name: true, price: true }, orderBy: (table, { asc }) => [asc(table.name)] }),
  ]);
  return <div className="p-4 lg:p-6"><VoucherManager batches={batches as Parameters<typeof VoucherManager>[0]["batches"]} products={productOptions} /></div>;
}
