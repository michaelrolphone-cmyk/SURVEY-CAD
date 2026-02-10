export function toErrorMessage(error, fallback = 'Unknown sensor error.') {
  if (error && typeof error.message === 'string' && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function createGuardedSensorHandler(handler, onError) {
  return (event) => {
    try {
      handler(event);
    } catch (error) {
      if (typeof onError === 'function') onError(error, event);
    }
  };
}

export function safeSocketSend(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(payload);
    return true;
  } catch {
    return false;
  }
}
