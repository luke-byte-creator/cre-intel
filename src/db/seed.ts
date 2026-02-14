import { seedComps } from "@/lib/seed-comps";
import { seedCorporateRegistries } from "@/lib/seed-corporate";
import { seedOffice } from "@/lib/seed-office";

async function main() {
  await seedComps();
  await seedCorporateRegistries();
  await seedOffice();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
