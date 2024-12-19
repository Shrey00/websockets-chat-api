import WebSocket from "ws";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import url from "url";
import { addAgentMessageJob, addAgentReplyJob } from "./queue";
// Types
// interface Message {
//   id: string;
//   userId: string;
//   content: string;
//   timestamp: number;
// }
// Create a queue instance

type Message = {
  id?: string;
  user: string;
  avatar: string;
  comment?: string;
  timestamp?: number;
  likes?: number;
};
type SendMessage = {
  type: "join" | "message" | "agent" | "history";
  agentForumId: string;
  agentForumName: string;
  userId: string;
  messages: Message[];
};

interface Forum {
  id: string;
  name: string;
  messages: Message[];
  clients: Set<WebSocket>;
}

// In-memory storage
const forums: Map<string, Forum> = new Map();

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  // res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end("WebSocket server is running");
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Broadcast message to all clients in a forum
function broadcastToForum(forum: Forum, message: any) {
  forum.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

export function isForumActive(agentForumId: string) {
  const forum = forums.get(agentForumId);
  if (forum) return true;
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

function saveMessages(messages: Message[], newMessage: Message) {
  messages.push(newMessage);
  if (messages.length > 50) {
    messages.shift();
  }
}
// Handle new WebSocket connections
wss.on("connection", (ws: WebSocket, req) => {
  const params = url.parse(req.url!, true).query;
  let currentForumId: string | null = params.agent_id! as string;
  let userId: string | null = null;
  ws.on("message", async (data: string) => {
    try {
      const message: SendMessage = JSON.parse(data);
      switch (message.type) {
        case "join":
          if (currentForumId) {
            const oldForum = forums.get(currentForumId);
            if (oldForum) {
              oldForum.clients.delete(ws);
            }
          }

          currentForumId = message.agentForumId as string;
          userId = message.userId;

          addAgentMessageJob({
            agentForumId: message.agentForumId,
            agentForumName: message.agentForumName,
          });

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
              const messageContent: Message = {
                id: uuidv4(),
                user: message.messages[0].user,
                avatar: message.messages[0].avatar,
                comment: message.messages[0].comment,
                likes: 0,
                timestamp: Date.now(),
              };
              const newMessage: SendMessage = {
                type: "message",
                userId,
                agentForumId: message.agentForumId,
                agentForumName: message.agentForumName,
                messages: [messageContent],
              };
              await addAgentReplyJob({
                user: message.messages[0].user,
                text: message.messages[0].comment!,
                agentForumId: message.agentForumId,
                agentForumName: message.agentForumName,
              });
              // forum.messages.push(messageContent);
              saveMessages(forum.messages, messageContent);
              broadcastToForum(forum, newMessage);
            }
          }
          break;

        default:
          console.warn("Unknown message type:", message.type);
      }
    } catch (error) {
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
export function sendAIMessageToForum(
  agentForumId: string,
  content: string,
  agentName: string,
  image: string,
  agentForumName: string
) {
  const forum = forums.get(agentForumId);
  if (forum) {
    const aiMessage: Message = {
      id: uuidv4(),
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
    console.log({newMessage});
    saveMessages(forum.messages, aiMessage);
    // forum.messages.push(aiMessage);
    broadcastToForum(forum, newMessage);
  } else {
    console.warn(`Forum with id ${agentForumId} not found`);
  }
}

// setInterval(async () => {
//   const activeForums = getActiveForums();
//   activeForums.forEach((item, index) => {
//     addAgentMessageJob({
//       agentForumId: item?.id!,
//       agentForumName: item?.name!,
//     });
//   });
// }, 5000);

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});
