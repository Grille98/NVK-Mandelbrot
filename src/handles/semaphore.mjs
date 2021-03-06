import { assertVulkan } from "../utils.mjs";
import Handle from "./handle.mjs";

export default class SemaphoreHandle extends Handle {
  constructor(owner, createInfo) {
    super(owner);

    let semaphoreCreateInfo = new VkSemaphoreCreateInfo();
    let semaphore = new VkSemaphore();
    vkCreateSemaphore(this.device, semaphoreCreateInfo, null, semaphore);

    this.vkSemaphore = semaphore;
  }
  destroy() {
    this.super_destroy();
    vkDestroySemaphore(this.device, this.vkSemaphore, null);
  }
}
