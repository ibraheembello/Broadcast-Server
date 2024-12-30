# Broadcast Server

A WebSocket-based broadcast server implementation that allows real-time communication between multiple clients.

Project based on: [roadmap.sh Broadcast Server Project](https://roadmap.sh/projects/broadcast-server)

## Features

- Real-time message broadcasting
- Private messaging using @username
- Username-based authentication
- Message history
- Timestamps on messages
- Command-line interface
- Graceful connection handling

## Installation

```bash
npm install
```

## Usage

Start the server:

```bash
npm run start
```

Connect as a client:

```bash
npm run connect
```

### Client Commands

- Send public message: Just type your message and press enter
- Send private message: Type "@username message" and press enter
- Quit: Type "quit" and press enter

## Technical Details

- Built with Node.js
- Uses WebSocket (ws) package for real-time communication
- Uses yargs for CLI argument parsing
- Implements a client-server architecture
