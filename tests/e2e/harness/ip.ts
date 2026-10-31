// Each harness request gets its own client IP so per-IP limits never couple scenarios; E27 pins its own IP to test them.
const b = () => Math.floor(Math.random() * 254) + 1;
export const randomTestIp = () => `10.${b()}.${b()}.${b()}`;
