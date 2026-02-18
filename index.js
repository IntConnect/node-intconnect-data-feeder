import ModbusRTU from "modbus-serial";

// Konfigurasi
const MODBUS_PORT = 502;
const HOST = "0.0.0.0";

// Holding Registers (1000 registers, each 16-bit)
const holdingRegisters = new Array(1000).fill(0);

// Coils untuk kontrol
const coils = {
  300: true,  // Enable Publishing
  301: false, // Reset Values
  302: true   // Enable Simulation
};

// Data chiller
let chillerData = {
  leavingTempSettings: 7.0,   // Target temperature
};

// Memory vector untuk Modbus server
const vector = {
  getInputRegister: function(addr) {
    return 0;
  },
  getHoldingRegister: function(addr, unitID) {
    // Address 0-1: Leaving ChiTemp Settings (40001)
    if (addr >= 0 && addr < holdingRegisters.length) {
      return holdingRegisters[addr];
    }
    return 0;
  },
  setRegister: function(addr, value) {
    if (addr >= 0 && addr < holdingRegisters.length) {
      holdingRegisters[addr] = value;
      console.log(`📝 Register ${addr} set to ${value}`);
      return;
    }
    console.log(`❌ Invalid register address: ${addr}`);
  },
  getCoil: function(addr) {
    // Coils 300-302 untuk kontrol
    if (addr >= 300 && addr <= 302) {
      return coils[addr] || false;
    }
    return false;
  },
  setCoil: function(addr, value) {
    if (addr >= 300 && addr <= 302) {
      coils[addr] = value;
      console.log(`🔘 Coil ${addr} set to ${value ? 'ON' : 'OFF'}`);
      return;
    }
    console.log(`❌ Invalid coil address: ${addr}`);
  }
};

// Helper: Convert float32 to 2 registers (Big Endian)
function float32ToRegisters(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeFloatBE(value, 0);
  const reg1 = buffer.readUInt16BE(0);
  const reg2 = buffer.readUInt16BE(2);
  console.log(`Float ${value} → Registers: [${reg1}, ${reg2}]`);
  return [reg1, reg2];
}

// Helper: Convert 2 registers to float32 (Big Endian)
function registersToFloat32(reg1, reg2) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt16BE(reg1, 0);
  buffer.writeUInt16BE(reg2, 2);
  return buffer.readFloatBE(0);
}

// Set float value ke holding registers
function setFloat32Value(startAddr, value) {
  const regs = float32ToRegisters(value);
  holdingRegisters[startAddr] = regs[0];
  holdingRegisters[startAddr + 1] = regs[1];
}

// Get float value dari holding registers
function getFloat32Value(startAddr) {
  return registersToFloat32(
    holdingRegisters[startAddr],
    holdingRegisters[startAddr + 1]
  );
}

// Initialize default values
function initializeDefaultValues() {
  console.log("\n🔧 Initializing default values...");
  setFloat32Value(0, chillerData.leavingTempSettings); // 40001

  console.log("📊 Register values after initialization:");
  console.log(`  Registers 0-1: [${holdingRegisters[0]}, ${holdingRegisters[1]}]`);
}

// Main publishing loop
function startPublishing() {
  setInterval(() => {
    // Baca control coils
    const publishEnabled = coils[300];
    const resetRequested = coils[301];
    const simulationEnabled = coils[302];

    // Handle reset
    if (resetRequested) {
      console.log("\n⚠️  Reset requested - restoring defaults");
      chillerData.leavingTempSettings = 7.0;
      coils[301] = false; // Clear reset flag
    }

    // Baca setting dari register (bisa diubah dari client)
    const currentSetting = getFloat32Value(0);
    if (currentSetting > 0 && currentSetting < 30) {
      chillerData.leavingTempSettings = currentSetting;
    }

    // Simulasi temperature changes
    if (simulationEnabled) {
      // Simulate entering temp (varies ±2°C around 12°C)
      const time = Date.now() / 10000;
      chillerData.enteringTemp = 12.0 + Math.sin(time) * 2.0;

      // Simulate leaving temp (gradually approaches target)
      const diff = chillerData.leavingTempSettings - chillerData.leavingTemp;
      chillerData.leavingTemp += diff * 0.1;
    }

    // Publish data
    if (publishEnabled) {
      setFloat32Value(0, chillerData.leavingTempSettings);

      console.log(
        `✓ Published → Setting: ${chillerData.leavingTempSettings.toFixed(2)}°C`
      );
    } else {
      console.log("⏸  Publishing paused (Coil 300 = OFF)");
    }
  }, 2000); // Update setiap 2 detik
}

// Buat Modbus TCP Server
console.log("Starting Modbus TCP Server...");

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: HOST,
  port: MODBUS_PORT,
  debug: false,
  unitID: 1
});

serverTCP.on("socketError", function(err) {
  console.error("❌ Socket error:", err);
});

serverTCP.on("initialized", function() {
  console.log("\n🚀 Modbus TCP Server Started!");
  console.log(`📡 Listening on ${HOST}:${MODBUS_PORT}`);
  console.log("\n=== Memory Map ===");
  console.log("Holding Registers (Float32 - 2 registers each):");
  console.log("  40001 (addr 0-1): Leaving Chilled Water Temp Settings");
  console.log("\nControl Coils:");
  console.log("  300: Enable/Disable Publishing");
  console.log("  301: Reset to Default Values");
  console.log("  302: Enable/Disable Simulation");
  console.log("\n=== Status ===");

  initializeDefaultValues();
  startPublishing();
});