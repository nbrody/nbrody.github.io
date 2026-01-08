import asyncio
import websockets
import json
import time
from IntegerMatricesOriginal import Solver, to_tuple

# Global state
solver = Solver()
running = False
clients = set()

async def broadcast(message):
    if not clients:
        return
    message_json = json.dumps(message)
    await asyncio.gather(*[client.send(message_json) for client in clients])

async def search_loop():
    global running, solver
    while True:
        if running:
            result = solver.step()
            
            # Prepare update message
            update = {
                'type': 'update',
                'iteration': result.get('iteration'),
                'beam_size': result.get('beam_size'),
                'best_score': result.get('best_score'),
                'status': result['status']
            }
            
            if result['status'] == 'found':
                update['solution'] = result['solution']
                update['matrix'] = result['matrix']
                update['trace'] = result['trace']
                running = False # Stop on success
            
            elif result['status'] == 'done':
                running = False
            
            # Add new nodes for visualization
            if 'new_nodes' in result:
                nodes_data = []
                for node in result['new_nodes']:
                    nodes_data.append({
                        'id': str(id(node)),
                        'parent': str(id(node.parent)) if node.parent else None,
                        'action': node.action_char,
                        'depth': node.depth,
                        'score': node.score,
                        'is_candidate': node.is_candidate()
                    })
                update['new_nodes'] = nodes_data
            
            # Add currently kept nodes (the beam) to highlight them
            if 'kept_nodes' in result:
                update['beam_ids'] = [str(id(n)) for n in result['kept_nodes']]

            await broadcast(update)
            
            # Rate limit slightly to not kill the browser
            await asyncio.sleep(0.05) 
        else:
            await asyncio.sleep(0.1)

async def handler(websocket):
    global running, solver
    clients.add(websocket)
    print("Client connected")
    
    try:
        # Send initial state
        await websocket.send(json.dumps({
            'type': 'init',
            'beam_width': 2000 # Should match config
        }))
        
        async for message in websocket:
            data = json.loads(message)
            command = data.get('command')
            
            if command == 'start':
                running = True
                print("Search started")
            elif command == 'pause':
                running = False
                print("Search paused")
            elif command == 'reset':
                running = False
                solver = Solver()
                print("Search reset")
                await broadcast({'type': 'reset'})
            elif command == 'step':
                running = False # Ensure auto-run is off
                # Run one step manually (logic handled in loop if we just set a flag, 
                # but here we might want immediate feedback. 
                # For simplicity, let's just toggle running for a split second or add a 'step_once' flag?
                # Actually, let's just call step() directly and broadcast.)
                result = solver.step()
                # ... (duplication of broadcast logic, maybe refactor later)
                # For now, let's just rely on start/pause.
                
    finally:
        clients.remove(websocket)
        print("Client disconnected")

async def main():
    print("Starting WebSocket server on port 8765...")
    # Start the search loop in the background
    asyncio.create_task(search_loop())
    
    async with websockets.serve(handler, "localhost", 8765):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
