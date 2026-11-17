import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import OutboxNotificationService from "./service";

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [OutboxNotificationService],
});
