import { seedComps } from "@/lib/seed-comps";
import { seedCorporateRegistries } from "@/lib/seed-corporate";

async function main() {
  await seedComps();
  await seedCorporateRegistries();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
