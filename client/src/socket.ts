import { io } from "socket.io-client";

const socket = io(window.location.origin, {
  transports: ["websocket", "polling"],
  autoConnect: false // don't connect until login
});

export default socket;