"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAIMessageToForum = sendAIMessageToForum;
const ws_1 = __importDefault(require("ws"));
const http_1 = __importDefault(require("http"));
const uuid_1 = require("uuid");
// In-memory storage
const forums = new Map();
// Create HTTP server
const server = http_1.default.createServer((req, res) => {
    res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
    });
    // res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("WebSocket server is running");
});
// Create WebSocket server
const wss = new ws_1.default.Server({ server });
// Broadcast message to all clients in a forum
function broadcastToForum(forum, message) {
    forum.clients.forEach((client) => {
        if (client.readyState === ws_1.default.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}
// Handle new WebSocket connections
wss.on("connection", (ws) => {
    let currentForumId = null;
    let userId = null;
    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data);
            console.log(message);
            switch (message.type) {
                case "join":
                    if (currentForumId) {
                        const oldForum = forums.get(currentForumId);
                        if (oldForum) {
                            oldForum.clients.delete(ws);
                        }
                    }
                    currentForumId = message.agentForumId;
                    userId = message.userId;
                    let forum = forums.get(currentForumId);
                    if (!forum) {
                        forum = {
                            id: currentForumId,
                            name: message.agentForumName || `Forum ${currentForumId}`,
                            messages: [],
                            clients: new Set(),
                        };
                        forums.set(currentForumId, forum);
                    }
                    forum.clients.add(ws);
                    // Send forum history to the new client
                    const newMessage = {
                        type: "history",
                        agentForumId: forum.id,
                        agentForumName: forum.name,
                        messages: forum.messages,
                    };
                    ws.send(JSON.stringify(newMessage));
                    broadcastToForum(forum, {
                        type: "userJoined",
                        userId,
                        timestamp: Date.now(),
                    });
                    break;
                case "message":
                    if (currentForumId && userId) {
                        const forum = forums.get(currentForumId);
                        if (forum) {
                            const messageContent = {
                                id: (0, uuid_1.v4)(),
                                user: message.messages[0].user,
                                avatar: message.messages[0].avatar,
                                comment: message.messages[0].comment,
                                likes: 0,
                                timestamp: Date.now(),
                            };
                            const newMessage = {
                                type: "message",
                                userId,
                                agentForumId: message.agentForumId,
                                agentForumName: message.agentForumName,
                                messages: [messageContent],
                            };
                            forum.messages.push(messageContent);
                            broadcastToForum(forum, newMessage);
                        }
                    }
                    break;
                default:
                    console.warn("Unknown message type:", message.type);
            }
        }
        catch (error) {
            console.error("Error processing message:", error);
        }
    });
    ws.on("close", () => {
        if (currentForumId && userId) {
            const forum = forums.get(currentForumId);
            if (forum) {
                forum.clients.delete(ws);
                broadcastToForum(forum, {
                    type: "userLeft",
                    userId,
                    timestamp: Date.now(),
                });
            }
        }
    });
});
// Function to send AI message to a forum
function sendAIMessageToForum(agentForumId, content, agentForumName) {
    const forum = forums.get(agentForumId);
    if (forum) {
        const aiMessage = {
            id: (0, uuid_1.v4)(),
            user: "agent boi",
            comment: content,
            timestamp: Date.now(),
            likes: 0,
            avatar: "",
        };
        const newMessage = {
            agentForumId: agentForumId,
            agentForumName: agentForumName,
            userId: "AI_AGENT",
            messages: [aiMessage],
        };
        forum.messages.push(aiMessage);
        broadcastToForum(forum, newMessage);
    }
    else {
        console.warn(`Forum with id ${agentForumId} not found`);
    }
}
// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`WebSocket server is running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map