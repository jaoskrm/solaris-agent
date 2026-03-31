type WebSocket = any;

interface Connection {
  ws: WebSocket;
  missionId: string;
}

class WsConnectionManagerClass {
  private connections: Map<string, Connection[]> = new Map();
  private server: any = null;

  setServer(server: any) {
    this.server = server;
  }

  addConnection(ws: WebSocket, missionId: string) {
    if (!this.connections.has(missionId)) {
      this.connections.set(missionId, []);
    }
    this.connections.get(missionId)?.push({ ws, missionId });
  }

  removeConnection(ws: WebSocket, missionId: string) {
    const connections = this.connections.get(missionId);
    if (connections) {
      const index = connections.findIndex((c) => c.ws === ws);
      if (index !== -1) {
        connections.splice(index, 1);
      }
      if (connections.length === 0) {
        this.connections.delete(missionId);
      }
    }
  }

  broadcastToMission(missionId: string, message: object) {
    const connections = this.connections.get(missionId);
    if (connections) {
      const messageStr = JSON.stringify(message);
      for (const connection of connections) {
        if (connection.ws.readyState === 1) {
          connection.ws.send(messageStr);
        }
      }
    }
  }

  getConnections(missionId: string): Connection[] {
    return this.connections.get(missionId) || [];
  }
}

export const wsConnectionManager = new WsConnectionManagerClass();

export function setWebSocketServer(server: any) {
  wsConnectionManager.setServer(server);
}