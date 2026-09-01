import { useAgent } from "agents/react";
import { useState } from "react";
import { ChattingRoomAgent} from '../worker/index'
import type {PingPongState} from '../worker/index'



function App() {
	const [isConnected, setIsConnected] = useState(false);
	const[pingPongs, setPingPongs] = useState(0);
	const agent = useAgent<ChattingRoomAgent, PingPongState>({
		agent: 'AGENT',
		onOpen: () => setIsConnected(true),
		onStateUpdate: (state) => setPingPongs(state.pingPongCount),
	});

	if (!isConnected) return <h1>connecting...</h1>;

	return (
	<div>
		<h1>Ping Pong Agent</h1>
		<h3>Count: {pingPongs}</h3>
		
	</div>
	);
}

export default App;
