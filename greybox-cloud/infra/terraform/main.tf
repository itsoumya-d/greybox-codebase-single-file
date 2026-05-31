terraform {
  required_version = ">= 1.7.0"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

output "deployment_note" {
  value = "Greybox Cloud alpha deploys through Fly.io first; AWS region ${var.region} is reserved for enterprise data residency."
}
