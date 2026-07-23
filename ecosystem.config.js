module.exports = {
  apps: [
    {
      name: "mobile-netra",
      script: "./node_modules/next/dist/bin/next",
      args: "start --port 3001",
      cwd: "D:\\mobile_netra",
      interpreter: "node",
      watch: false,
    },
  ],
};
