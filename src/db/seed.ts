import { seedComps } from "@/lib/seed-comps";
import { seedCorporateRegistries } from "@/lib/seed-corporate";
import { seedOffice } from "@/lib/seed-office";
import { seedMulti } from "@/lib/seed-multi";
import { seedRetail } from "@/lib/seed-retail";

async function main() {
  await seedComps();
  await seedCorporateRegistries();
  await seedOffice();
  await seedMulti();
  await seedRetail();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
