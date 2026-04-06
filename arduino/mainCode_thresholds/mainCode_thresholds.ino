#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>

// -----------------------------
// WiFi credentials
// -----------------------------
const char* ssid = "ak";
const char* password = "88888888";

// -----------------------------
// MQTT broker details
// -----------------------------
const char* mqttServer = "broker.hivemq.com";
const int mqttPort = 1883;

// MQTT topics
const char* topicSensorData = "sensor/data";
const char* topicValveCommand = "valve/command";
const char* topicMotorCommand = "motor/command";
const char* topicSettings = "system/settings";

WiFiClient espClient;
PubSubClient client(espClient);

// -----------------------------
// Pin definitions
// -----------------------------
const int flowSensorPin = D2;
const int valvePin = D1;
const int motorPin = D0;
const int trigPin = D5;
const int echoPin = D6;
const int irPin = D7;

// -----------------------------
// Flow sensor variables
// -----------------------------
volatile int pulseCount = 0;
float flowRate = 0.0;
float totalLitres = 0.0;
float waterLevel = 0.0;
unsigned long oldTime = 0;

// -----------------------------
// Tank and threshold settings
// -----------------------------
const float tankHeight = 100.0;
float lowWaterThreshold = 20.0;
float highWaterThreshold = 90.0;
unsigned long flowRunTimeoutSec = 5;

// Flow-run auto cutoff (seconds)
unsigned long flowStartTime = 0;
bool flowTimerRunning = false;
bool lowLevelAlertSent = false;
bool highLevelCutoffSent = false;
bool personDetected = false;

// -----------------------------
// Telegram Bot
// -----------------------------
#define BOTtoken "REPLACE_WITH_BOT_TOKEN"
#define CHAT_ID "REPLACE_WITH_CHAT_ID"
WiFiClientSecure securedClient;
UniversalTelegramBot bot(BOTtoken, securedClient);

void IRAM_ATTR pulseCounter() {
  pulseCount++;
}

void setup_wifi() {
  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected!");
}

void turnValveOn(const char* reason) {
  digitalWrite(valvePin, HIGH);
  Serial.print("Valve ON: ");
  Serial.println(reason);
}

void turnValveOff(const char* reason) {
  digitalWrite(valvePin, LOW);
  flowTimerRunning = false;
  Serial.print("Valve OFF: ");
  Serial.println(reason);
}

void turnMotorOn(const char* reason) {
  digitalWrite(motorPin, HIGH);
  Serial.print("Motor ON: ");
  Serial.println(reason);
}

void turnMotorOff(const char* reason) {
  digitalWrite(motorPin, LOW);
  Serial.print("Motor OFF: ");
  Serial.println(reason);
}

float getWaterLevel() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  float distance = duration * 0.0343 / 2.0;

  if (distance < 2 || distance > 400) {
    return waterLevel;
  }

  float level = tankHeight - distance;
  if (level < 0) level = 0;
  if (level > tankHeight) level = tankHeight;
  return level;
}

float extractJsonFloat(const String& json, const char* key, float fallbackValue) {
  String token = "\"" + String(key) + "\":";
  int start = json.indexOf(token);
  if (start < 0) {
    return fallbackValue;
  }

  start += token.length();
  while (start < (int)json.length() && (json[start] == ' ' || json[start] == '\"')) {
    start++;
  }

  int end = start;
  while (end < (int)json.length()) {
    char current = json[end];
    if ((current >= '0' && current <= '9') || current == '.' || current == '-') {
      end++;
    } else {
      break;
    }
  }

  if (end == start) {
    return fallbackValue;
  }

  return json.substring(start, end).toFloat();
}

void applyRemoteSettings(const String& message) {
  float newLowThreshold = extractJsonFloat(message, "minTankLevel", lowWaterThreshold);
  float newHighThreshold = extractJsonFloat(message, "maxTankLevel", highWaterThreshold);
  float newAutoCutoff = extractJsonFloat(message, "autoCutoffTimeoutSec", (float)flowRunTimeoutSec);

  if (newLowThreshold < 0) newLowThreshold = 0;
  if (newHighThreshold > tankHeight) newHighThreshold = tankHeight;
  if (newLowThreshold >= newHighThreshold) {
    Serial.println("Ignored invalid remote thresholds.");
    return;
  }

  lowWaterThreshold = newLowThreshold;
  highWaterThreshold = newHighThreshold;
  flowRunTimeoutSec = (unsigned long)newAutoCutoff;
  if (flowRunTimeoutSec < 1) flowRunTimeoutSec = 1;

  Serial.println("Applied remote settings from web app.");
  Serial.print("Low threshold: ");
  Serial.println(lowWaterThreshold);
  Serial.print("High threshold: ");
  Serial.println(highWaterThreshold);
  Serial.print("Auto cutoff seconds: ");
  Serial.println(flowRunTimeoutSec);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  String receivedTopic = String(topic);

  if (receivedTopic == topicSettings) {
    applyRemoteSettings(message);
    return;
  }

  if (receivedTopic == topicValveCommand) {
    if (message.indexOf("true") >= 0) {
      turnValveOn("MQTT command");
    } else {
      turnValveOff("MQTT command");
    }
    return;
  }

  if (receivedTopic != topicMotorCommand) {
    return;
  }

  if (message.indexOf("true") >= 0) {
    if (waterLevel >= highWaterThreshold) {
      Serial.println("Motor ON blocked: tank already above high threshold");
      bot.sendMessage(CHAT_ID, "Motor start blocked because tank is already at the high threshold.", "");
      return;
    }

    turnMotorOn("MQTT command");
  } else {
    turnMotorOff("MQTT command");
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting to MQTT...");
    String clientId = "ESP8266Client-" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println(" connected");
      client.subscribe(topicValveCommand);
      client.subscribe(topicMotorCommand);
      client.subscribe(topicSettings);
    } else {
      Serial.print(" failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5s");
      delay(5000);
    }
  }
}

void handleTelegram() {
  int numNewMessages = bot.getUpdates(bot.last_message_received + 1);

  for (int i = 0; i < numNewMessages; i++) {
    String chat_id = String(bot.messages[i].chat_id);
    String text = bot.messages[i].text;

    if (text == "/status") {
      String status =
        "FlowRate: " + String(flowRate, 2) + " L/min\n" +
        "TotalLitres: " + String(totalLitres, 2) + " L\n" +
        "WaterLevel: " + String(waterLevel, 1) + " cm\n" +
        "PersonDetected: " + String(personDetected ? "YES" : "NO") + "\n" +
        "Valve: " + String(digitalRead(valvePin) ? "ON" : "OFF") + "\n" +
        "Motor: " + String(digitalRead(motorPin) ? "ON" : "OFF") + "\n" +
        "LowThreshold: " + String(lowWaterThreshold, 1) + " cm\n" +
        "HighThreshold: " + String(highWaterThreshold, 1) + " cm\n" +
        "AutoCutoff: " + String(flowRunTimeoutSec) + " sec";

      bot.sendMessage(chat_id, status, "");
    }
  }
}

void enforceThresholdLimits() {
  if (waterLevel >= highWaterThreshold) {
    if (digitalRead(motorPin) == HIGH) {
      turnMotorOff("High water threshold reached");
    }

    if (!highLevelCutoffSent) {
      highLevelCutoffSent = true;
      bot.sendMessage(CHAT_ID, "High water threshold reached. Motor turned OFF to prevent overflow.", "");
    }
  } else {
    highLevelCutoffSent = false;
  }

  if (waterLevel <= lowWaterThreshold) {
    if (digitalRead(motorPin) == LOW) {
      turnMotorOn("Low water threshold reached");
    }

    if (!lowLevelAlertSent) {
      lowLevelAlertSent = true;
      bot.sendMessage(CHAT_ID, "Low water threshold reached. Motor turned ON to refill tank.", "");
    }
  } else {
    lowLevelAlertSent = false;
  }
}

void handleFlowSafety(unsigned long currentTime) {
  personDetected = (digitalRead(irPin) == LOW);

  if (personDetected) {
    Serial.println("Person detected near tap.");
    flowTimerRunning = false;
    return;
  }

  if (flowRate > 0.01 && digitalRead(valvePin) == HIGH) {
    if (!flowTimerRunning) {
      flowTimerRunning = true;
      flowStartTime = currentTime;
      Serial.println("Water flowing without person detection. Starting valve cutoff timer.");
    } else if (currentTime - flowStartTime >= flowRunTimeoutSec * 1000UL) {
      turnValveOff("Continuous flow timeout");
      bot.sendMessage(CHAT_ID, "Auto cutoff triggered. Valve turned OFF due to continuous flow.", "");
    }
  } else {
    flowTimerRunning = false;
  }
}

void publishTelemetry() {
  char payload[192];

  snprintf(
    payload,
    sizeof(payload),
    "{\"flowRate\":%.2f,\"totalLitres\":%.2f,\"waterLevel\":%.2f,\"valve\":%s,\"motor\":%s,\"personDetected\":%s,\"lowThreshold\":%.2f,\"highThreshold\":%.2f}",
    flowRate,
    totalLitres,
    waterLevel,
    digitalRead(valvePin) ? "true" : "false",
    digitalRead(motorPin) ? "true" : "false",
    personDetected ? "true" : "false",
    lowWaterThreshold,
    highWaterThreshold
  );

  client.publish(topicSensorData, payload);
}

void setup() {
  Serial.begin(115200);
  securedClient.setInsecure();

  pinMode(flowSensorPin, INPUT_PULLUP);
  pinMode(valvePin, OUTPUT);
  pinMode(motorPin, OUTPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(irPin, INPUT);

  turnValveOff("Initial boot");
  turnMotorOff("Initial boot");
  attachInterrupt(digitalPinToInterrupt(flowSensorPin), pulseCounter, FALLING);

  setup_wifi();
  client.setServer(mqttServer, mqttPort);
  client.setCallback(mqttCallback);

  Serial.println("Telegram bot ready");
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }

  client.loop();
  handleTelegram();

  unsigned long currentTime = millis();
  if (currentTime - oldTime < 2000) {
    return;
  }

  noInterrupts();
  int pulses = pulseCount;
  pulseCount = 0;
  interrupts();

  flowRate = pulses / 7.5;
  totalLitres += (flowRate / 60.0) * 2.0;
  waterLevel = getWaterLevel();

  handleFlowSafety(currentTime);
  enforceThresholdLimits();

  oldTime = currentTime;

  Serial.print("FlowRate: ");
  Serial.print(flowRate);
  Serial.print(" L/min | Total: ");
  Serial.print(totalLitres);
  Serial.print(" L | WaterLevel: ");
  Serial.print(waterLevel);
  Serial.print(" cm | Valve: ");
  Serial.print(digitalRead(valvePin) ? "ON" : "OFF");
  Serial.print(" | Motor: ");
  Serial.print(digitalRead(motorPin) ? "ON" : "OFF");
  Serial.print(" | Person: ");
  Serial.println(personDetected ? "DETECTED" : "NOT DETECTED");

  publishTelemetry();
}
