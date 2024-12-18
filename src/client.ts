import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:4000");

const userId = "user_" + Math.random().toString(36).substr(2, 9);
const agentForumId = "forum_1";
type Message = {
  id?: string;
  user: string;
  avatar?: string;
  comment?: string;
  timestamp?: number;
  likes?: number;
};
type SendMessage = {
  userId: string;

  type: "join" | "message" | "agent" | "history";
  agentForumId: string;
  agentForumName: string;
  messages: Message[];
};
ws.on("open", () => {
  console.log("Connected to the WebSocket server");

  // Join a forum

  const message: Message = {
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
  setTimeout(() => {
    ws.send(
      JSON.stringify({
        messages: [
          {
            user: "Me",
            comment: "Hey guysss",
            avatar: "https://www.w3schools.com/howto/img_avatar.png",
          },
        ],
        userId,
        type: "message",
        agentForumName: "AI forum",
        agentForumId,
      })
    );
  }, 1000);
});

ws.on("message", (data: string) => {
  const message = JSON.parse(data);
  console.log("Received:", message);
});

ws.on("close", () => {
  console.log("Disconnected from the WebSocket server");
});
