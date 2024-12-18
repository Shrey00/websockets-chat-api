"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const ws = new ws_1.default("ws://localhost:4000");
const userId = "user_" + Math.random().toString(36).substr(2, 9);
const agentForumId = "forum_1";
ws.on("open", () => {
    console.log("Connected to the WebSocket server");
    // Join a forum
    const message = {
        user: "Me",
        // avatar: "https://www.w3schools.com/howto/img_avatar.png",
    };
    const newMessage = {
        userId,
        type: "join",
        agentForumName: "AI forum",
        agentForumId,
        messages: [message],
    };
    ws.send(JSON.stringify(newMessage));
    // Send a message after joining
    setInterval(() => {
        ws.send(JSON.stringify({
            messages: [
                {
                    user: "Me",
                    comment: "Hey guys",
                    avatar: "https://www.w3schools.com/howto/img_avatar.png",
                },
            ],
            userId,
            type: "message",
            agentForumName: "AI forum",
            agentForumId,
        }));
    }, 5000);
});
ws.on("message", (data) => {
    const message = JSON.parse(data);
    console.log("Received:", message);
});
ws.on("close", () => {
    console.log("Disconnected from the WebSocket server");
});
//# sourceMappingURL=client.js.map