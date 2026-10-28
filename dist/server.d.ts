import 'dotenv/config';
import { Server as SocketIOServer } from 'socket.io';
declare const app: import("express-serve-static-core").Express;
export declare const httpServer: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
export declare const io: SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
export default app;
//# sourceMappingURL=server.d.ts.map