import { useAgent } from "agents/react";
import { useState } from "react";
import type { ChattingRoomAgent, ChattingRoomState } from "../worker/index";

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState("");
  const agent = useAgent<ChattingRoomAgent, ChattingRoomState>({
    agent: "AGENT",
    onOpen: () => setIsConnected(true),
    onMessage: (event) => console.log(event),
  });
  const sendMessage = () => {
    agent.send(message);
    setMessage("");
  };
  if (!isConnected) return <h1>connecting...</h1>;

  return (
    <div>
      <h1>Ping Pong Agent</h1>
      <h3>Count: {agent?.state?.currentlyOnline}</h3>
      <hr />
			<form onSubmit={(e)=>{
				e.preventDefault();
				sendMessage();
			}}>
				<input type="text" value={message}  onChange={(e)=>setMessage(e.target.value)} placeholder="Type a message..." autoFocus/>
			</form>
    </div>
  );
}

export default App;
