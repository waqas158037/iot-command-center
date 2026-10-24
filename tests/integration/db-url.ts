export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://iot:iot@localhost:5432/iot_command_center_test?schema=public";
  const name = new URL(url).pathname.slice(1);
  if (!/test/i.test(name)) throw new Error(`Refusing to run destructive tests against database "${name}": its name must contain "test".`);
  return url;
}
