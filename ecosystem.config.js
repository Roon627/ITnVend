module.exports = {
  apps: [
    {
      name: "pos-backend",
      cwd: "./POS/Backend",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    },
    {
      name: "estore-backend",
      cwd: "./estore/Backend",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 4100
      }
    }
  ]
}
