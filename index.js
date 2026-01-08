// Modbus TCP Server untuk Chiller Water Temperature
// Install: npm install modbus-serial
// Run: node server.js
// Note: Tambahkan "type": "module" di package.json

import ModbusRTU from "modbus-serial";

// Konfigurasi
const MODBUS_PORT = 503;
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
    enteringTemp: 12.0,          // Entering water temp
    leavingTemp: 7.5             // Leaving water temp
};

// Memory vector untuk Modbus server
const vector = {
    getInputRegister: function (addr) {
        return 0;
    },
    getHoldingRegister: function (addr, unitID) {
        // 40001-40003 untuk temperature (each uses 2 registers for float32)
        // Address 0-1: Leaving Temp Settings (40001)
        // Address 2-3: Entering Temp (40002)
        // Address 4-5: Leaving Temp (40003)
        if (addr >= 0 && addr < holdingRegisters.length) {
            return holdingRegisters[addr];
        }
        return 0;
    },
    setRegister: function (addr, value) {
        if (addr >= 0 && addr < holdingRegisters.length) {
            holdingRegisters[addr] = value;
            console.log(`📝 Register ${addr} set to ${value}`);
            return;
        }
        console.log(`❌ Invalid register address: ${addr}`);
    },
    getCoil: function (addr) {
        // Coils 300-302 untuk kontrol
        if (addr >= 300 && addr <= 302) {
            return coils[addr] || false;
        }
        return false;
    },
    setCoil: function (addr, value) {
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
    return [
        buffer.readUInt16BE(0),
        buffer.readUInt16BE(2)
    ];
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
    setFloat32Value(0, chillerData.leavingTempSettings); // 40001
    setFloat32Value(2, chillerData.enteringTemp);        // 40002
    setFloat32Value(4, chillerData.leavingTemp);         // 40003
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
            chillerData.enteringTemp = 12.0;
            chillerData.leavingTemp = 7.5;
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
            setFloat32Value(2, chillerData.enteringTemp);
            setFloat32Value(4, chillerData.leavingTemp);

            console.log(
                `✓ Published → Setting: ${chillerData.leavingTempSettings.toFixed(2)}°C | ` +
                `Entering: ${chillerData.enteringTemp.toFixed(2)}°C | ` +
                `Leaving: ${chillerData.leavingTemp.toFixed(2)}°C`
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

serverTCP.on("socketError", function (err) {
    console.error("❌ Socket error:", err);
});

serverTCP.on("initialized", function () {
    console.log("\n🚀 Modbus TCP Server Started!");
    console.log(`📡 Listening on ${HOST}:${MODBUS_PORT}`);
    console.log("\n=== Memory Map ===");
    console.log("Holding Registers (Float32 - 2 registers each):");
    console.log("  40001 (addr 0-1): Leaving Chilled Water Temp Settings");
    console.log("  40002 (addr 2-3): Entering Chilled Water Temp");
    console.log("  40003 (addr 4-5): Leaving Chilled Water Temp");
    console.log("\nControl Coils:");
    console.log("  300: Enable/Disable Publishing");
    console.log("  301: Reset to Default Values");
    console.log("  302: Enable/Disable Simulation");
    console.log("\n=== Status ===");

    initializeDefaultValues();
    startPublishing();
});