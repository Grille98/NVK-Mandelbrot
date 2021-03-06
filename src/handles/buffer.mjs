import { assertVulkan } from "../utils.mjs";
import Handle from "./handle.mjs";
import nvk from "nvk";
import * as enums from "../snvk-enum.mjs";

class BindingObj {
  constructor(bufferHandle, binding, stride) {
    this.owner = bufferHandle.owner; this.buffer = bufferHandle; this.binding = binding; this.stride = stride;
  }
  getAttribute(location, type, size, offset = 0) {
    return new AttributeObj(this, location, type, size, offset);
  }
}
class AttributeObj {
  constructor(bindingObj, location, type, size, offset) {
    this.owner = bindingObj.owner;
    let format = getVkFormat(this.owner, type >> 4, size, type & 15);
    this.binding = bindingObj; this.location = location; this.format = format; this.offset = offset;
  }
}
class DescriptorObj {
  constructor(bufferHandle, binding, type) {
    this.buffer = bufferHandle; this.binding = binding; this.type = type;
  }
}

export default class BufferHandle extends Handle {
  constructor(owner, { size, usage, staging = enums.BUFFER_STAGING_DYNAMIC, readable = false }) {
    super(owner);

    let vkUsageBits = getVkBufferUsageBits(this.owner, usage, readable);

    let hostBuffer = null;
    if (staging === enums.BUFFER_STAGING_STATIC) {
      hostBuffer = createVkHostBuffer(this.owner, size, vkUsageBits.host);
    }
    let localBuffer = createVkBuffer(this.owner,
      size,
      vkUsageBits.local,
      VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT
    );

    this.id = -1;
    this.vksHost = hostBuffer;
    this.vksLocal = localBuffer;
    this.vkUsageBits = vkUsageBits;
    this.staging = staging;
    this.usage = usage;
    this.size = size;
    this.readable = readable;
  }

  destroy() {
    this.super_destroy();
    let { owner } = this;
    if (this.staging === enums.BUFFER_STAGING_STATIC) {
      destroyVkBuffer(owner, this.vksHost);
    }
    destroyVkBuffer(owner, this.vksLocal);
  }

  subData(offsetDst, data, offsetSrc, length = null) {
    let dataPtr = { $: 0n };
    if (length === null) length = data.buffer.size;

    let offsetHost = offsetDst;
    if (this.staging === enums.BUFFER_STAGING_DYNAMIC) {
      this.vksHost = createVkHostBuffer(this.owner, length, this.vkUsageBits.host);
      offsetHost = 0;
    }

    let result = vkMapMemory(this.device, this.vksHost.vkMemory, offsetHost, length, 0, dataPtr);
    assertVulkan(result);

    let dstView = new Uint8Array(ArrayBuffer.fromAddress(dataPtr.$, length));
    let srcView = new Uint8Array(data.buffer).subarray(offsetSrc, offsetSrc + length);
    dstView.set(srcView, 0);

    vkUnmapMemory(this.device, this.vksHost.vkMemory);

    copyVkBuffer(this.owner, this.vksHost.vkBuffer, offsetHost, this.vksLocal.vkBuffer, offsetDst, length);

    if (this.staging === enums.BUFFER_STAGING_DYNAMIC) {
      destroyVkBuffer(this.owner, this.vksHost);
    }
  }
  readData(offset = 0, length = null) {
    let dataPtr = { $: 0n };
    if (length === null) length = this.size;

    let offsetHost = offset;
    if (this.staging === enums.BUFFER_STAGING_DYNAMIC) {
      this.vksHost = createVkHostBuffer(this.owner, length, this.vkUsageBits.host);
      offsetHost = 0;
    }

    copyVkBuffer(this.owner, this.vksLocal.vkBuffer, offset, this.vksHost.vkBuffer, offsetHost, length);

    let result = vkMapMemory(this.device, this.vksHost.vkMemory, offsetHost, length, 0, dataPtr);
    assertVulkan(result);

    let buffer = ArrayBuffer.fromAddress(dataPtr.$, length);

    if (this.staging === enums.BUFFER_STAGING_DYNAMIC) {
      destroyVkBuffer(this.owner, this.vksHost);
    }

    return buffer;
  }
  
  copy(srcHandle, offsetSrc, dstHandle, offsetDst, size) {
    copyVkBuffer(this.owner, srcHandle.vksLocal.vkBuffer, offsetSrc, dstHandle.vksLocal.vkBuffer, offsetDst, size);
  }

  getBinding(binding = 0, stride = 1) {
    return new BindingObj(this, binding, stride);
  }

  getDescriptor(binding, type) {
    return new DescriptorObj(this, binding, type)
  }
}

function createVkHostBuffer(owner, size, bufferUsageFlags) {
  return createVkBuffer(owner,
    size,
    bufferUsageFlags,
    VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT
  );
}

function copyVkBuffer(owner, src, offsetSrc, dst, offsetDst, size) {
  let commandCreateInfo = {
    level: enums.COMMAND_LEVEL_PRIMARY,
    usage: enums.COMMAND_USAGE_ONE_TIME,
    queue: enums.COMMAND_QUEUE_TRANSFER,
  }
  let command = owner.createCommandBuffer(commandCreateInfo);

  command.begin();
  let { vkCommandBuffer } = command;

  let bufferCopy = new VkBufferCopy();
  bufferCopy.srcOffset = offsetSrc;
  bufferCopy.dstOffset = offsetDst;
  bufferCopy.size = size;
  vkCmdCopyBuffer(vkCommandBuffer, src, dst, 1, [bufferCopy]);

  command.end();

  let submitInfo = {
    commandBuffer: command,
    blocking: false,
  }
  owner.submit(submitInfo);

  command.destroy();
}

function createVkBuffer(owner, bufferSize, bufferUsageFlags, memoryPropertieFlags) {
  let bufferInfo = new VkBufferCreateInfo();
  bufferInfo.size = bufferSize;
  bufferInfo.usage = bufferUsageFlags;
  bufferInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
  bufferInfo.queueFamilyIndexCount = 0;
  bufferInfo.pQueueFamilyIndices = null;

  let buffer = new VkBuffer();
  let result = vkCreateBuffer(owner.device, bufferInfo, null, buffer);
  assertVulkan(result);

  let memoryRequirements = new VkMemoryRequirements()
  vkGetBufferMemoryRequirements(owner.device, buffer, memoryRequirements);

  let memoryAllocateInfo = new VkMemoryAllocateInfo();
  memoryAllocateInfo.allocationSize = memoryRequirements.size;
  memoryAllocateInfo.memoryTypeIndex = findVkMemoryTypeIndex(owner,
    memoryRequirements.memoryTypeBits, memoryPropertieFlags
  );

  let memory = new VkDeviceMemory();
  result = vkAllocateMemory(owner.device, memoryAllocateInfo, null, memory);
  assertVulkan(result);

  vkBindBufferMemory(owner.device, buffer, memory, 0n);

  return {
    vkBuffer: buffer,
    vkMemory: memory,
  }
}

function destroyVkBuffer(owner, buffer) {
  vkFreeMemory(owner.device, buffer.vkMemory);
  vkDestroyBuffer(owner.device, buffer.vkBuffer, null);
}

function getVkFormat(owner, size, vec, type) {
  let enumName = `VK_FORMAT_`
  size *= 8;
  switch (vec) {
    case 1: enumName += `R${size}`; break;
    case 2: enumName += `R${size}G${size}`; break;
    case 3: enumName += `R${size}G${size}B${size}`; break;
    case 4: enumName += `R${size}G${size}B${size}A${size}`; break;
  }
  switch (type) {
    case enums.UINT: enumName += `_UINT`; break;
    case enums.INT: enumName += `_SINT`; break;
    case enums.FLOAT: enumName += `_SFLOAT`; break;
  }
  return nvk[enumName];
}

function getVkBufferUsageBits(owner, usage, readable) {
  let host = VK_BUFFER_USAGE_TRANSFER_SRC_BIT;
  let local = VK_BUFFER_USAGE_TRANSFER_DST_BIT;
  if (readable) {
    host |= VK_BUFFER_USAGE_TRANSFER_DST_BIT;
    local |= VK_BUFFER_USAGE_TRANSFER_SRC_BIT;
  }
  local |= usage;
  return { host, local };
}

function findVkMemoryTypeIndex(owner, typeFilter, properties) {
  let memoryProperties = new VkPhysicalDeviceMemoryProperties();
  vkGetPhysicalDeviceMemoryProperties(owner.physicalDevice, memoryProperties);
  for (let i = 0; i < memoryProperties.memoryTypeCount; i++) {
    if (typeFilter & (1 << i) && ((memoryProperties.memoryTypes[i].propertyFlags & properties))) {
      return i;
    }
  }
}