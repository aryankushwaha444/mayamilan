const registerNotificationSocket = (
    io,
    socket
  ) => {
    socket.on(
      "mark_notifications_read",
      () => {
        // Notification functionality
        // will be connected later.
      }
    );
  };
  
  export default registerNotificationSocket;