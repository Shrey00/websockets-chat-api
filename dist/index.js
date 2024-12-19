"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isForumActive = isForumActive;
exports.sendAIMessageToForum = sendAIMessageToForum;
const ws_1 = __importDefault(require("ws"));
const http_1 = __importDefault(require("http"));
const uuid_1 = require("uuid");
const ioredis_1 = __importDefault(require("ioredis"));
const url_1 = __importDefault(require("url"));
require("dotenv/config");
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
const redisConnection = new ioredis_1.default(process.env.REDIS_PUBLIC_URL);
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
function isForumActive(agentForumId) {
    const forum = forums.get(agentForumId);
    if (forum)
        return true;
    return false;
}
function getActiveForums() {
    const activeForums = [];
    for (const [key, value] of forums) {
        if (value.clients.size) {
            activeForums.push(forums.get(key));
        }
    }
    return activeForums;
}
function saveMessages(messages, newMessage) {
    messages.push(newMessage);
    if (messages.length > 50) {
        messages.shift();
    }
}
function getReplyFromAgent(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { user, text, agentForumId, agentForumName } = params;
        try {
            const response = yield fetch(`${process.env.API_URL}/api/agent/${agentForumId}/chatbot-reply`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    userText: `By: ${user} message: ${text}`,
                    history: [
                        {
                            role: "user",
                            content: `By: ${user} message: ${text}`,
                        },
                    ],
                }),
            });
            const { replyText, ignore, reason, agentName, image } = yield response.json();
            sendAIMessageToForum(agentForumId, replyText, agentName, image, agentForumName);
        }
        catch (e) {
            console.log(e);
        }
    });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function getMessageFromAgent(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { agentForumId, agentForumName } = params;
        if (isForumActive(agentForumId)) {
            //get number of saved LLM responses
            const MAX_SAVE_RESP = 4;
            const currentCount = yield redisConnection.llen(agentForumId);
            //if less than 15 store, fetch api,and save it in the redis list
            //else use the redis list to get the saved response and use that to send randomly
            try {
                if (currentCount < MAX_SAVE_RESP) {
                    const response = yield fetch(`${process.env.API_URL}/api/agent/${agentForumId}/chatbot-reply`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            userText: `Hello`,
                            history: [
                                {
                                    role: "user",
                                    content: `Get creative and create a very short content, no need of confirming or anything else, content as per your personality, think different and new.`,
                                },
                            ],
                        }),
                    });
                    const { replyText, ignore, reason, agentName, image } = yield response.json();
                    if (replyText) {
                        yield redisConnection.rpush(agentForumId, JSON.stringify({ replyText, agentName, image }));
                        sendAIMessageToForum(agentForumId, replyText, agentName, image, agentForumName);
                    }
                }
                else {
                    const cachedAgentResponse = yield getRandomResponse(agentForumId);
                    const { replyText, agentName, image } = cachedAgentResponse;
                    if (replyText) {
                        yield redisConnection.rpush(agentForumId, JSON.stringify({ replyText, agentName, image }));
                        sendAIMessageToForum(agentForumId, replyText, agentName, image, agentForumName);
                    }
                }
            }
            catch (e) {
                console.log(e);
            }
            yield sleep(10000);
        }
    });
}
function getRandomResponse(key) {
    return __awaiter(this, void 0, void 0, function* () {
        const responses = yield redisConnection.lrange(key, 0, -1);
        if (responses.length) {
            const randomIndex = Math.floor(Math.random() * responses.length);
            return JSON.parse(responses[randomIndex]);
        }
        return null;
    });
}
// Handle new WebSocket connections
wss.on("connection", (ws, req) => {
    const params = url_1.default.parse(req.url, true).query;
    let currentForumId = params.agent_id;
    let userId = null;
    ws.on("message", (data) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const message = JSON.parse(data);
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
                    console.log({ userId }, "joined");
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
                    // //why
                    // ws.send(JSON.stringify(newMessage));
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
                            console.log("Text: ", messageContent.comment);
                            saveMessages(forum.messages, messageContent);
                            broadcastToForum(forum, newMessage);
                            yield getReplyFromAgent({
                                user: message.messages[0].user,
                                text: message.messages[0].comment,
                                agentForumId: message.agentForumId,
                                agentForumName: message.agentForumName,
                            });
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
    }));
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
function sendAIMessageToForum(agentForumId, content, agentName, image, agentForumName) {
    const forum = forums.get(agentForumId);
    if (forum) {
        const aiMessage = {
            id: (0, uuid_1.v4)(),
            user: agentName,
            comment: content,
            timestamp: Date.now(),
            likes: 0,
            avatar: image,
        };
        const newMessage = {
            agentForumId: agentForumId,
            agentForumName: agentForumName,
            type: "agent",
            userId: "AI_AGENT",
            messages: [aiMessage],
        };
        console.log({ newMessage });
        saveMessages(forum.messages, aiMessage);
        // forum.messages.push(aiMessage);
        broadcastToForum(forum, newMessage);
    }
    else {
        console.warn(`Forum with id ${agentForumId} not found`);
    }
}
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    const activeForums = getActiveForums();
    console.log("Agent Message Request");
    activeForums.forEach((item, index) => __awaiter(void 0, void 0, void 0, function* () {
        yield getMessageFromAgent({
            agentForumId: item === null || item === void 0 ? void 0 : item.id,
            agentForumName: item === null || item === void 0 ? void 0 : item.name,
        });
    }));
}), 15000);
// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`WebSocket server is running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map