const { z } = require("zod");

// REST body validation schemas
const registerSchema = z.object({
    username: z.string()
        .min(3, "Username must be at least 3 characters long")
        .max(30, "Username cannot exceed 30 characters")
        .regex(/^[a-zA-Z0-9_\-]+$/, "Username can only contain alphanumeric characters, underscores, and hyphens")
        .toLowerCase(),
    password: z.string()
        .min(6, "Password must be at least 6 characters long")
});

const loginSchema = z.object({
    username: z.string().toLowerCase(),
    password: z.string()
});

// Socket event payload validation schemas
const privateMessageSchema = z.object({
    toUser: z.string().min(1, "Recipient username is required"),
    message: z.string().min(1, "Message content cannot be empty").max(5000, "Message is too long")
});

const groupMessageSchema = z.object({
    message: z.string().min(1, "Message content cannot be empty").max(5000, "Message is too long")
});

const typingSchema = z.object({
    toUser: z.string().min(1, "Recipient username is required")
});

module.exports = {
    registerSchema,
    loginSchema,
    privateMessageSchema,
    groupMessageSchema,
    typingSchema
};
