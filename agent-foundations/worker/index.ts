import { Agent, routeAgentRequest, type Connection, type WSMessage } from "agents";

export type ChattingRoomState = {
  currentlyOnline: number;
};

export class ChattingRoomAgent extends Agent<Env, ChattingRoomState> {
  initialState = {
    currentlyOnline: 0,
  };

  onConnect(){
	this.setState({
		currentlyOnline: this.state.currentlyOnline +1
	})
  }

  onClose(){
	this.setState({
		currentlyOnline: this.state.currentlyOnline -1,
	})
  }
  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
	console.log(message);
	connection.send('back');
  }
}

export default {
  async fetch(request, env) {
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
