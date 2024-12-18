import WebSocket from "ws";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import { sendAIMessageToForum } from "./index";
import { isForumActive } from "./index";
const redisConnection = new IORedis({
  host: "localhost",
  port: 6379,
});
export const agentRequestReplyQueue = new Queue("agent-reply-queue", {
  connection: redisConnection,
});
export const agentRequestMessageQueue = new Queue("agent-message-queue", {
  connection: redisConnection,
});
import { Worker } from "bullmq";

// Redis connection options
const connection = {
  host: "localhost",
  port: 6379,
};

export const agentReplyWorker = new Worker(
  "agent-reply-queue",
  async (job) => {
    const response = await fetch(
      `http://localhost:3000/api/agent/${job.data.agentForumId}/chatbot-reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userText: `By: ${job.data.user} message: ${job.data.text}`,
          history: [
            {
              role: "user",
              content: `By: ${job.data.user} message: ${job.data.text}`,
            },
          ],
        }),
      }
    );
    const { replyText, ignore, reason, agentName, image } =
      await response.json();
    console.log(job.data.agentForumId, replyText, job.data.agentForumName);
    sendAIMessageToForum(
      job.data.agentForumId,
      replyText,
      agentName,
      image,
      job.data.agentForumName
    );
  },
  { connection }
);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const agentMessageWorker = new Worker(
  "agent-message-queue",
  async (job) => {
    if (isForumActive(job.data.agentForumId)) {
      const response = await fetch(
        `http://localhost:3000/api/agent/${job.data.agentForumId}/chatbot-reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userText: `Hello`,
            history: [
              {
                role: "user",
                content: `take this as a system prompt. Just get creative and create some very small content, and share it, no need of confirming or anything else, just create a content as per your personality, think different and new`,
              },
            ],
          }),
        }
      );
      const { replyText, ignore, reason, agentName, image } =
        await response.json();
      if (replyText) {
        sendAIMessageToForum(
          job.data.agentForumId,
          replyText,
          agentName,
          image,
          job.data.agentForumName
        );
      }

      await sleep(6000);
    }
  },
  { connection }
);

// Handle errors
agentReplyWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

async function monitorQueue() {
  const jobCounts = await agentRequestReplyQueue.getJobCounts();
  console.log("Job counts:", jobCounts);

  const waitingJobs = await agentRequestReplyQueue.getWaiting();
  console.log("Waiting jobs:", waitingJobs);
}

export async function addAgentReplyJob(params: {
  user: string;
  text: string;
  agentForumId: string;
  agentForumName: string;
}) {
  const job = await agentRequestReplyQueue.add("request-reply", {
    user: params.user,
    text: params.text,
    agentForumId: params.agentForumId,
    agentForumName: params.agentForumName,
  });
}
export async function addAgentMessageJob(params: {
  agentForumId: string;
  agentForumName: string;
}) {
  const job = await agentRequestMessageQueue.add("request-message", {
    agentForumId: params.agentForumId,
    agentForumName: params.agentForumName,
  });
}

setInterval(async () => {
  const replyWaitingCounts = await agentRequestReplyQueue.getWaitingCount();
  const messageWaitingCounts = await agentRequestMessageQueue.getWaitingCount();
  if (replyWaitingCounts > 60) {
    agentReplyWorker.opts.concurrency = 10;
  } else if (replyWaitingCounts > 30) {
    agentReplyWorker.opts.concurrency = 5;
  } else {
    agentReplyWorker.opts.concurrency = 2;
  }
  if (messageWaitingCounts > 60) {
    agentMessageWorker.opts.concurrency = 10;
  } else if (messageWaitingCounts > 30) {
    agentMessageWorker.opts.concurrency = 5;
  } else {
    agentMessageWorker.opts.concurrency = 2;
  }
}, 5000);
monitorQueue();
