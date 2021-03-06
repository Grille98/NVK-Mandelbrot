import { assertVulkan } from "../utils.mjs"
import Handle from "./handle.mjs";

export default class PipelineLayoutHandle extends Handle {
  constructor(owner, { descriptors, flags }) {
    super(owner);
    let result = 0;

    let descriptorSetLayout = null;
    let descriptorPool = null;
    let descriptorSet = null;

    let enabled = descriptors.length > 0;
    if (enabled) {
      let typeCounter = new Uint8Array(20);
      let descriptorPoolSizes = [];
      let layoutBindings = [];

      for (let i = 0; i < descriptors.length; i++) {
        let { binding, type } = descriptors[i];

        let layoutBinding = new VkDescriptorSetLayoutBinding();
        layoutBinding.binding = binding;
        layoutBinding.descriptorType = type;
        layoutBinding.descriptorCount = 1;
        layoutBinding.stageFlags = flags;
        layoutBinding.pImmutableSamplers = null;

        typeCounter[type] += 1;

        layoutBindings[i] = layoutBinding;
      }

      let layoutInfo = new VkDescriptorSetLayoutCreateInfo();
      layoutInfo.bindingCount = layoutBindings.length;
      layoutInfo.pBindings = layoutBindings;

      descriptorSetLayout = new VkDescriptorSetLayout();
      result = vkCreateDescriptorSetLayout(owner.device, layoutInfo, null, descriptorSetLayout);
      assertVulkan(result);

      for (let type = 0; type < typeCounter.length; type++) {
        let count = typeCounter[type];

        if (count > 0) {
          let descriptorPoolSize = new VkDescriptorPoolSize();
          descriptorPoolSize.type = type;
          descriptorPoolSize.descriptorCount = count;
          descriptorPoolSizes.push(descriptorPoolSize);
        }
      }

      let descriptorPoolInfo = new VkDescriptorPoolCreateInfo();
      descriptorPoolInfo.maxSets = descriptors.length;
      descriptorPoolInfo.poolSizeCount = descriptorPoolSizes.length;
      descriptorPoolInfo.pPoolSizes = descriptorPoolSizes;

      descriptorPool = new VkDescriptorPool();
      result = vkCreateDescriptorPool(owner.device, descriptorPoolInfo, null, descriptorPool);
      assertVulkan(result);

      let descriptorSetAllocInfo = new VkDescriptorSetAllocateInfo();
      descriptorSetAllocInfo.descriptorPool = descriptorPool;
      descriptorSetAllocInfo.descriptorSetCount = 1;
      descriptorSetAllocInfo.pSetLayouts = [descriptorSetLayout];

      descriptorSet = new VkDescriptorSet();
      result = vkAllocateDescriptorSets(owner.device, descriptorSetAllocInfo, [descriptorSet]);
      assertVulkan(result);

      let writeDescriptorSets = [];

      for (let i = 0; i < descriptors.length; i++) {
        let { buffer, binding, type } = descriptors[i];

        let bufferInfo = new VkDescriptorBufferInfo();
        bufferInfo.buffer = buffer.vksLocal.vkBuffer;
        bufferInfo.offset = 0n;
        bufferInfo.range = buffer.size;

        let writeDescriptorSet = new VkWriteDescriptorSet();
        writeDescriptorSet.dstSet = descriptorSet;
        writeDescriptorSet.dstBinding = binding;
        writeDescriptorSet.descriptorCount = 1;
        writeDescriptorSet.descriptorType = type;
        writeDescriptorSet.pBufferInfo = [bufferInfo];

        writeDescriptorSets[i] = writeDescriptorSet;
      }
      vkUpdateDescriptorSets(owner.device, descriptors.length, writeDescriptorSets, 0, null);
    }

    let pipelineLayoutInfo = new VkPipelineLayoutCreateInfo();
    if (enabled) {
      pipelineLayoutInfo.setLayoutCount = 1;
      pipelineLayoutInfo.pSetLayouts = [descriptorSetLayout];
    }

    let pipelineLayout = new VkPipelineLayout();
    result = vkCreatePipelineLayout(owner.device, pipelineLayoutInfo, null, pipelineLayout);
    assertVulkan(result);

    this.vkPipelineLayout = pipelineLayout;
    this.vkPool = descriptorPool;
    this.vkSetLayout = descriptorSetLayout;
    this.vkSet = descriptorSet;
    this.enabled = enabled;
  }
  destroy() {
    this.super_destroy();
    vkDestroyDescriptorSetLayout(this.device, this.vkSetLayout, null);
    vkDestroyDescriptorPool(this.device, this.vkPool, null);
    vkDestroyPipelineLayout(this.device, this.vkPipelineLayout, null);
  }
}