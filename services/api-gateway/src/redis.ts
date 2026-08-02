export interface GatewayRedis {
  ping(): Promise<string>;
  quit(): Promise<string>;
}
