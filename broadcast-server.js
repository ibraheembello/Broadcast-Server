// broadcast-server.js
const WebSocket = require('ws');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const readline = require('readline');

class BroadcastServer {
    constructor(host = 'localhost', port = 8765) {
        this.host = host;
        this.port = port;
        this.clients = new Set();
        this.messageHistory = [];
        this.usernames = new Map(); // Map WebSocket to username
    }

    start() {
        this.server = new WebSocket.Server({ host: this.host, port: this.port });

        console.log(`Server started on ws://${this.host}:${this.port}`);

        this.server.on('connection', (ws) => {
            this.handleConnection(ws);
        });

        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    handleConnection(ws) {
        this.clients.add(ws);
        console.log(`New client connected. Total clients: ${this.clients.size}`);

        ws.on('message', (message) => {
            const data = this.parseMessage(message.toString());
            
            if (data.type === 'auth') {
                this.handleAuth(ws, data.username);
            } else if (data.type === 'private') {
                this.handlePrivateMessage(ws, data);
            } else {
                this.broadcast(data.content, ws);
            }
        });

        // Send authentication request
        ws.send(JSON.stringify({ type: 'auth_request' }));

        ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`Client disconnected. Total clients: ${this.clients.size}`);
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.clients.delete(ws);
        });
    }

    parseMessage(message) {
        try {
            return JSON.parse(message);
        } catch {
            return { type: 'message', content: message };
        }
    }

    handleAuth(ws, username) {
        if ([...this.usernames.values()].includes(username)) {
            ws.send(JSON.stringify({ type: 'auth_error', content: 'Username already taken' }));
            return;
        }
        
        this.usernames.set(ws, username);
        ws.send(JSON.stringify({ 
            type: 'auth_success',
            content: 'Authentication successful',
            history: this.messageHistory.slice(-10)
        }));
    }

    handlePrivateMessage(ws, data) {
        const sender = this.usernames.get(ws);
        const recipient = [...this.usernames.entries()]
            .find(([_, name]) => name === data.recipient)?.[0];

        if (recipient) {
            const message = {
                type: 'private',
                sender,
                content: data.content,
                timestamp: new Date().toISOString()
            };
            recipient.send(JSON.stringify(message));
            ws.send(JSON.stringify(message)); // Send to sender as well
        }
    }

    broadcast(message, sender) {
        const username = this.usernames.get(sender) || 'Anonymous';
        const broadcastMessage = {
            type: 'broadcast',
            sender: username,
            content: message,
            timestamp: new Date().toISOString()
        };

        this.messageHistory.push(broadcastMessage);
        if (this.messageHistory.length > 100) this.messageHistory.shift();

        this.clients.forEach((client) => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(broadcastMessage));
            }
        });
    }

    stop() {
        console.log('\nShutting down server...');
        this.server.close(() => {
            console.log('Server stopped');
            process.exit(0);
        });
    }
}

class BroadcastClient {
    constructor(uri = 'ws://localhost:8765') {
        this.uri = uri;
        this.ws = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.username = null;
    }

    connect() {
        this.ws = new WebSocket(this.uri);

        this.ws.on('open', () => {
            console.log(`Connected to ${this.uri}`);
        });

        this.ws.on('message', (message) => {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'auth_request':
                    this.handleAuthRequest();
                    break;
                case 'auth_success':
                    console.log(data.content);
                    this.showMessageHistory(data.history);
                    this.startMessageLoop();
                    break;
                case 'auth_error':
                    console.log('Error:', data.content);
                    this.handleAuthRequest();
                    break;
                case 'private':
                    console.log(`\nPrivate message from ${data.sender} [${new Date(data.timestamp).toLocaleTimeString()}]: ${data.content}`);
                    this.promptMessage();
                    break;
                case 'broadcast':
                    console.log(`\n${data.sender} [${new Date(data.timestamp).toLocaleTimeString()}]: ${data.content}`);
                    this.promptMessage();
                    break;
            }
        });

        this.ws.on('close', () => {
            console.log('\nDisconnected from server');
            this.rl.close();
            process.exit(0);
        });

        this.ws.on('error', (error) => {
            console.error('Connection error:', error.message);
            process.exit(1);
        });
    }

    handleAuthRequest() {
        this.rl.question('Enter your username: ', (username) => {
            this.username = username;
            this.ws.send(JSON.stringify({ type: 'auth', username }));
        });
    }

    showMessageHistory(history) {
        if (history?.length) {
            console.log('\n=== Recent Messages ===');
            history.forEach(msg => {
                console.log(`${msg.sender} [${new Date(msg.timestamp).toLocaleTimeString()}]: ${msg.content}`);
            });
            console.log('==================\n');
        }
    }

    startMessageLoop() {
        this.promptMessage();
    }

    promptMessage() {
        this.rl.question('Enter message ("@username message" for private, "quit" to exit): ', (input) => {
            if (input.toLowerCase() === 'quit') {
                this.ws.close();
                return;
            }

            if (input.startsWith('@')) {
                const [recipient, ...messageParts] = input.slice(1).split(' ');
                const content = messageParts.join(' ');
                this.ws.send(JSON.stringify({
                    type: 'private',
                    recipient,
                    content
                }));
            } else {
                this.ws.send(input);
            }
        });
    }
}

// CLI setup
const argv = yargs(hideBin(process.argv))
    .command('start', 'Start the broadcast server', {
        host: {
            description: 'Host address',
            default: 'localhost'
        },
        port: {
            description: 'Port number',
            default: 8765
        }
    })
    .command('connect', 'Connect to the broadcast server as a client', {
        host: {
            description: 'Host address',
            default: 'localhost'
        },
        port: {
            description: 'Port number',
            default: 8765
        }
    })
    .demandCommand(1, 'You must specify an action: start or connect')
    .help()
    .argv;

const [command] = argv._;
const { host, port } = argv;

if (command === 'start') {
    const server = new BroadcastServer(host, port);
    server.start();
} else if (command === 'connect') {
    const uri = `ws://${host}:${port}`;
    const client = new BroadcastClient(uri);
    client.connect();
}